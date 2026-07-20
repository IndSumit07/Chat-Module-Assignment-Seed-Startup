import express from 'express';
import { uploadFiles } from '../controllers/upload.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = express.Router();

router.use(authenticate);

// Handle up to 10 files at once
router.post('/', upload.array('files', 10), uploadFiles);

export default router;
