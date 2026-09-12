import { pythonAssetResponse } from "@/lib/runtime/python-assets";
export const runtime = "nodejs";
export const maxDuration = 60;
export function GET(request: Request) {
  return pythonAssetResponse(request);
}
export function HEAD(request: Request) {
  return pythonAssetResponse(request);
}
