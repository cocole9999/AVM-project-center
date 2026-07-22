/**
 * 通用文件下载辅助
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * 从 axios 响应中提取文件名 (Content-Disposition)
 */
export function getFilenameFromResponse(headers: any, fallback: string): string {
  const cd = headers?.['content-disposition'] || headers?.['Content-Disposition'];
  if (cd) {
    const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch { return m[1]; }
    }
  }
  return fallback;
}
