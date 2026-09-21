import { Router } from 'express';
import {
  getConversations,
  getMessages,
  sendMessage,
  markConversationRead,
  getUnreadCount,
  getDefaultAdmin,
} from './support.controller';
import { authenticate } from '../../middleware/authenticate';
import { createSingleFileUpload } from '../../middleware/upload';
import { validateUuidParam } from '../../middleware/validate';

const uploadAttachment = createSingleFileUpload({
  fieldName: 'attachment',
  maxBytes: 25 * 1024 * 1024, // 25 MB max
  allowedMimePrefixes: ['image/', 'audio/'],
  errorMessage: 'Support attachment must be an image or audio voice note',
});

export const supportRouter = Router();

supportRouter.use(authenticate);

supportRouter.get('/conversations', getConversations);
supportRouter.get('/unread-count', getUnreadCount);
supportRouter.get('/default-admin', getDefaultAdmin);
supportRouter.get('/messages/:otherUserId', validateUuidParam('otherUserId'), getMessages);
supportRouter.post('/messages', uploadAttachment, sendMessage);
supportRouter.patch('/messages/:otherUserId/read', validateUuidParam('otherUserId'), markConversationRead);
