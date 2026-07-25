import { ResourceStore } from '../rest/store';
import type { IUser } from './user';

export const userStore = new ResourceStore<IUser>();
