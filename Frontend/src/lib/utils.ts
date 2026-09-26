import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** The one class-name helper. `cn('p-2', cond && 'p-4')` -> `'p-4'`. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
