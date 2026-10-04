import { send } from './client';

export function uploadFile(file: File) {
  const body = new FormData();
  body.set('file', file);
  return send<{ id: string }>('POST', '/files', body);
}
