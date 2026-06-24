import { NotFoundError } from '../../common/errors';
import { notificationRepository } from './notification.repository';
import {
  CreateNotificationInput,
  NotificationFilter,
} from './notification.types';

export class NotificationService {
  list(filter: NotificationFilter) {
    return notificationRepository.findAll(filter);
  }

  async getById(id: string, userId: string) {
    const item = await notificationRepository.findById(id, userId);
    if (!item) throw new NotFoundError('Notification', id);
    return item;
  }

  getSummary(userId: string) {
    return notificationRepository.getSummary(userId);
  }

  async create(input: CreateNotificationInput): Promise<string> {
    return notificationRepository.create(input);
  }

  async createMany(inputs: CreateNotificationInput[]): Promise<void> {
    await Promise.all(inputs.map((input) => notificationRepository.create(input)));
  }

  async markRead(id: string, userId: string, updatedBy: string): Promise<void> {
    const existing = await notificationRepository.findById(id, userId);
    if (!existing) throw new NotFoundError('Notification', id);
    if (existing.isRead) return;
    await notificationRepository.markRead(id, userId, updatedBy);
  }

  markAllRead(userId: string, updatedBy: string) {
    return notificationRepository.markAllRead(userId, updatedBy);
  }

  async markUnread(id: string, userId: string, updatedBy: string): Promise<void> {
    const existing = await notificationRepository.findById(id, userId);
    if (!existing) throw new NotFoundError('Notification', id);
    if (!existing.isRead) return;
    await notificationRepository.markUnread(id, userId, updatedBy);
  }

  async dismiss(id: string, userId: string, deletedBy: string): Promise<void> {
    const dismissed = await notificationRepository.dismiss(id, userId, deletedBy);
    if (!dismissed) throw new NotFoundError('Notification', id);
  }
}

export const notificationService = new NotificationService();
