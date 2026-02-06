import path from 'node:path'
import { defineConfig } from 'prisma/config'
import dotenv from 'dotenv'

// Charger .env depuis la racine du projet
dotenv.config({ path: path.join(import.meta.dirname, '..', '..', '.env') })

export default defineConfig({
    earlyAccess: true,
    schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
    datasource: {
        url: process.env.DATABASE_URL!,
    },
    migrate: {
        async url() {
            return process.env.DATABASE_URL!
        },
    },
})
