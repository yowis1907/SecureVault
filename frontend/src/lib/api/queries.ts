import { useQuery } from '@tanstack/react-query';
import { auth } from './endpoints';

/** The signed-in account, or a 401 ApiError when there is no session. */
export function useCurrentUser() {
  return useQuery({ queryKey: ['me'], queryFn: auth.me });
}
