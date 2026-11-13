import { API_BASE_URL, apiDelete, apiGet, apiPost } from '@/shared/api/httpClient';
import { projectApiPath } from '@/shared/project/rules';
import { mapApiJobRun, type ApiJobRun } from '@/domains/pipelines/infrastructure/apiMapping';
import type { CreateDatasetResponse, DatasetsGateway } from '../application/DatasetsGateway';
import type { Dataset, DatasetProfile, UploadInput } from '../domain/entities';
import type { QueryError, QueryResult } from '@/domains/sql-editor/domain/entities';

interface ApiCreateResponse {
  dataset: Dataset;
  run: ApiJobRun;
}

/**
 * Multipart upload with progress. fetch() cannot report upload progress,
 * so this is the one XMLHttpRequest in the app. The text fields go before
 * the file part, which is what the control-plane's streaming reader expects.
 */
function uploadMultipart(path: string, input: UploadInput): Promise<CreateDatasetResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    if (input.name) form.append('name', input.name);
    if (input.layer) form.append('layer', input.layer);
    form.append('file', input.file, input.file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}${path}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && input.onProgress) input.onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new Error('upload failed: network error'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as ApiCreateResponse;
          resolve({ dataset: body.dataset, run: mapApiJobRun(body.run) });
        } catch (err) {
          reject(err instanceof Error ? err : new Error('upload failed: bad response'));
        }
      } else {
        reject(new Error(`upload failed: ${xhr.status} ${xhr.responseText.trim() || xhr.statusText}`));
      }
    };
    xhr.send(form);
  });
}

export const httpDatasetsGateway: DatasetsGateway = {
  list: (p) => apiGet<Dataset[]>(projectApiPath(p, 'datasets')),
  get: (p, name) => apiGet<Dataset>(projectApiPath(p, `datasets/${encodeURIComponent(name)}`)),
  upload: (p, input) => uploadMultipart(projectApiPath(p, 'datasets'), input),
  addFile: (p, name, input) => uploadMultipart(projectApiPath(p, `datasets/${encodeURIComponent(name)}/files`), input),
  async createFromUrl(p, input) {
    const body = await apiPost<ApiCreateResponse>(projectApiPath(p, 'datasets'), input);
    return { dataset: body.dataset, run: mapApiJobRun(body.run) };
  },
  remove: (p, name) => apiDelete(projectApiPath(p, `datasets/${encodeURIComponent(name)}`)),
  preview: (p, name, limit = 20) => apiGet<QueryResult | QueryError>(projectApiPath(p, `datasets/${encodeURIComponent(name)}/preview?limit=${limit}`)),
  profile: (p, name) => apiGet<DatasetProfile>(projectApiPath(p, `datasets/${encodeURIComponent(name)}/profile`)),
};
