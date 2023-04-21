import express, { Router, Request, Response } from "express";
import multer, { FileFilterCallback } from 'multer';
import { getConfigs, createConfig, deleteConfig, downloadConfigs, uploadConfigs } from "../controllers/configs.js";

const router: Router = express.Router();

const storage = multer.diskStorage({
  destination: function (req: Request, file: Express.Multer.File, cb: Function) {
    cb(null, './');
  },
  filename: function (req: Request, file: Express.Multer.File, cb: Function) {
    cb(null, 'db.json')
  }
})

const upload = multer({
  storage: storage,
  fileFilter: function (req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
    if (file.mimetype !== 'application/json') {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  }
})

router.get('/', getConfigs)
router.post('/', createConfig)
router.delete('/:id', deleteConfig)
router.get('/download', downloadConfigs)
router.post('/upload', upload.single('file'), uploadConfigs)

export default router;
