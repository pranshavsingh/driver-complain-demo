import { Router } from 'express';
import multer from 'multer';
import {
  getConversations,
  getMessages,
  sendMessage,
  markConversationRead,
  getUnreadCount,
  getDefaultAdmin,
} from './support.controller';
import { authenticate } from '../../middleware/authenticate';

const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
}).single('attachment');

export const supportRouter = Router();

supportRouter.use(authenticate);

supportRouter.get('/conversations', getConversations);
supportRouter.get('/unread-count', getUnreadCount);
supportRouter.get('/default-admin', getDefaultAdmin);
supportRouter.get('/messages/:otherUserId', getMessages);
supportRouter.post('/messages', uploadAttachment, sendMessage);
supportRouter.patch('/messages/:otherUserId/read', markConversationRead);


