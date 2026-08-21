import { useMutation } from '@tanstack/react-query';
import { httpQueryGateway } from '../infrastructure/httpQueryGateway';

/** The one place a gateway implementation gets selected. Swap to
 * mockQueryGateway here if the control-plane isn't running locally. */
const gateway = httpQueryGateway;

export function useRunQuery() {
  return useMutation({
    mutationFn: (sql: string) => gateway.runQuery(sql),
  });
}
