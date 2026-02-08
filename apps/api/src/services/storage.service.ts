/**
 * Storage Service — S3-Compatible Object Storage
 *
 * Abstracts file upload/download/delete for:
 *  - VolumeScan images (scan evidence)
 *  - Delivery proof (photos + signatures)
 *  - Document attachments
 *
 * Uses AWS SDK v3 — compatible with S3, MinIO, Cloudflare R2, DigitalOcean Spaces.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../lib/logger';
import crypto from 'crypto';
import path from 'path';

// ==================================================
// CONFIG
// ==================================================

export interface StorageConfig {
    bucket: string;
    region: string;
    endpoint?: string;      // Custom endpoint for MinIO/R2/Spaces
    accessKeyId: string;
    secretAccessKey: string;
    cdnBaseUrl?: string;     // Optional CDN prefix for public URLs
}

function getStorageConfig(): StorageConfig {
    return {
        bucket: process.env['S3_BUCKET'] || 'translogistics-uploads',
        region: process.env['S3_REGION'] || 'eu-west-3',
        endpoint: process.env['S3_ENDPOINT'] || undefined,
        accessKeyId: process.env['S3_ACCESS_KEY_ID'] || '',
        secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] || '',
        cdnBaseUrl: process.env['S3_CDN_URL'] || undefined,
    };
}

// ==================================================
// S3 CLIENT SINGLETON
// ==================================================

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
    if (!s3Client) {
        const config = getStorageConfig();
        s3Client = new S3Client({
            region: config.region,
            endpoint: config.endpoint,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
            forcePathStyle: !!config.endpoint,  // Required for MinIO/R2
        });
    }
    return s3Client;
}

// ==================================================
// TYPES
// ==================================================

export type StorageFolder =
    | 'scans'             // VolumeScan images
    | 'delivery-proof'    // Photos + signatures
    | 'documents'         // General documents
    | 'avatars';          // User profile images

export interface UploadResult {
    key: string;          // S3 object key
    url: string;          // Public/CDN URL
    contentType: string;
    sizeBytes: number;
}

export interface UploadOptions {
    folder: StorageFolder;
    fileName?: string;        // Optional custom name (auto-generated if missing)
    contentType?: string;
    metadata?: Record<string, string>;
}

// ==================================================
// CORE FUNCTIONS
// ==================================================

/**
 * Upload a file buffer to S3.
 * Returns the storage key and public URL.
 */
export async function uploadFile(
    buffer: Buffer,
    options: UploadOptions,
): Promise<UploadResult> {
    const config = getStorageConfig();
    const client = getS3Client();

    // Generate unique key
    const ext = options.fileName
        ? path.extname(options.fileName)
        : guessExtension(options.contentType || 'application/octet-stream');
    const uniqueId = crypto.randomUUID();
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const key = `${options.folder}/${datePrefix}/${uniqueId}${ext}`;

    const contentType = options.contentType || 'application/octet-stream';

    try {
        await client.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            Metadata: options.metadata,
        }));

        const url = config.cdnBaseUrl
            ? `${config.cdnBaseUrl}/${key}`
            : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;

        logger.info({ key, sizeBytes: buffer.length, contentType }, 'File uploaded to S3');

        return {
            key,
            url,
            contentType,
            sizeBytes: buffer.length,
        };
    } catch (error) {
        logger.error({ error, key, folder: options.folder }, 'S3 upload failed');
        throw new Error(`Storage upload failed: ${(error as Error).message}`);
    }
}

/**
 * Upload a base64-encoded image string to S3.
 * Accepts both raw base64 and data URI (data:image/png;base64,...).
 */
export async function uploadBase64(
    base64Data: string,
    options: UploadOptions,
): Promise<UploadResult> {
    // Strip data URI prefix if present
    const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    let contentType = options.contentType || 'image/jpeg';
    let rawBase64 = base64Data;

    if (match) {
        contentType = match[1]!;
        rawBase64 = match[2]!;
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    return uploadFile(buffer, { ...options, contentType });
}

/**
 * Generate a pre-signed URL for temporary secure download.
 * Default expiry: 1 hour.
 */
export async function getSignedDownloadUrl(
    key: string,
    expiresInSeconds: number = 3600,
): Promise<string> {
    const config = getStorageConfig();
    const client = getS3Client();

    const command = new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
    });

    const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    return url;
}

/**
 * Delete a file from S3.
 */
export async function deleteFile(key: string): Promise<void> {
    const config = getStorageConfig();
    const client = getS3Client();

    try {
        await client.send(new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: key,
        }));
        logger.info({ key }, 'File deleted from S3');
    } catch (error) {
        logger.error({ error, key }, 'S3 delete failed');
        throw new Error(`Storage delete failed: ${(error as Error).message}`);
    }
}

/**
 * Upload multiple base64 images in parallel.
 * Used for delivery proof (multiple photos).
 */
export async function uploadMultipleBase64(
    base64Images: string[],
    folder: StorageFolder,
    metadata?: Record<string, string>,
): Promise<UploadResult[]> {
    return Promise.all(
        base64Images.map((img, i) =>
            uploadBase64(img, {
                folder,
                metadata: { ...metadata, index: String(i) },
            })
        ),
    );
}

// ==================================================
// HELPERS
// ==================================================

function guessExtension(contentType: string): string {
    const map: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'application/pdf': '.pdf',
        'application/octet-stream': '.bin',
    };
    return map[contentType] || '.bin';
}
