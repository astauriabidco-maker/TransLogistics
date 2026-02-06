/**
 * Admin Dashboard - Redirect to Shipments
 */
import { redirect } from 'next/navigation';

export default function AdminPage(): never {
    redirect('/admin/shipments' as never);
}
