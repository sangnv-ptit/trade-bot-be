"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const configs_js_1 = require("../controllers/configs.js");
const router = express_1.default.Router();
router.get('/', configs_js_1.getConfigs);
router.post('/', configs_js_1.createConfig);
router.delete('/:id', configs_js_1.deleteConfig);
exports.default = router;
