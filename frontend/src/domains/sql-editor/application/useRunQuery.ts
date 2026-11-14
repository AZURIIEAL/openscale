import { useMutation } from '@tanstack/react-query';
import { httpQueryGateway } from '../infrastructure/httpQueryGateway';
import { useQueryTarget } from './useQueryTarget';

/** The one place a gateway implementation gets selected. Swap to
 * mockQueryGateway here if the control-plane isn't running locally. */
const gateway = httpQueryGateway;

export function useRunQuery() {
  const target = useQueryTarget();
  return useMutation({
    mutationFn: (sql: string) => gateway.runQuery(target, sql),
  });
}
