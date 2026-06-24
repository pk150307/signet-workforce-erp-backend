import { NotFoundError } from '../../common/errors';
import { usersRepository } from '../users/users.repository';
import { loginHistoryRepository } from './login-history.repository';
import { LoginHistoryFilter } from './login-history.types';

export class LoginHistoryService {
  async list(filter: LoginHistoryFilter) {
    return loginHistoryRepository.findAll(filter);
  }

  async listForUser(userId: string, filter: LoginHistoryFilter) {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return loginHistoryRepository.findAll({ ...filter, userId });
  }

  async getSummary(userId?: string) {
    return loginHistoryRepository.getSummary(userId);
  }
}

export const loginHistoryService = new LoginHistoryService();
