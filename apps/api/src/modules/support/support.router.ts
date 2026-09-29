import { Router } from 'express';
import {
  getConversations,
  getMessages,
  sendMessage,
  markConversationRead,
  getUnreadCount,
  getDefaultAdmin,
  attachToComplaint,
  detachFromComplaint,
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

// Specialized message actions
supportRouter.post('/messages/attach-to-complaint', attachToComplaint);
supportRouter.post('/messages/:messageId/attach-to-complaint', validateUuidParam('messageId'), attachToComplaint);
supportRouter.delete('/messages/:messageId/detach-from-complaint', validateUuidParam('messageId'), detachFromComplaint);
supportRouter.post('/messages/:messageId/detach-from-complaint', validateUuidParam('messageId'), detachFromComplaint);

supportRouter.get('/messages/:otherUserId', validateUuidParam('otherUserId'), getMessages);
supportRouter.post('/messages', uploadAttachment, sendMessage);
supportRouter.patch('/messages/:otherUserId/read', validateUuidParam('otherUserId'), markConversationRead);


