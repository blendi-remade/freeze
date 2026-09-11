import { assembleNative } from '@/lib/native-export';

export async function POST(request: Request) {
  return assembleNative(request);
}
