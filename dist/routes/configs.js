"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const configs_js_1 = require("../controllers/configs.js");
const router = express_1.default.Router();
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './');
    },
    filename: function (req, file, cb) {
        cb(null, 'db.json');
    }
});
const upload = (0, multer_1.default)({
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype !== 'application/json') {
            return cb(new Error('Invalid file type'));
        }
        cb(null, true);
    }
});
router.get('/', configs_js_1.getConfigs);
router.post('/', configs_js_1.createConfig);
router.delete('/:id', configs_js_1.deleteConfig);
router.get('/download', configs_js_1.downloadConfigs);
router.post('/upload', upload.single('file'), configs_js_1.uploadConfigs);
exports.default = router;
