import { nativeExportAvailable } from '@/lib/native-export';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    { nativeExport: await nativeExportAvailable() },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
