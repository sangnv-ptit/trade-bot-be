import express, { Router, Request, Response } from "express";
import { getConfigs, createConfig, deleteConfig } from "../controllers/configs.js";

const router: Router = express.Router();

router.get('/', getConfigs)
router.post('/', createConfig)
router.delete('/:id', deleteConfig)

export default router;
