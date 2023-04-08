"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const configs_1 = __importDefault(require("./routes/configs"));
const symbols_1 = __importDefault(require("./routes/symbols"));
const login_1 = __importDefault(require("./routes/login"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
/* ROUTES */
app.use("/symbols", symbols_1.default);
app.use("/configs", configs_1.default);
app.use('/login', login_1.default);
/* MONGOOSE SETUP */
const PORT = process.env.PORT || 8000;
mongoose_1.default
    .connect(process.env.MONGO_URL || "")
    .then(() => {
    app.listen(PORT, () => console.log(`Server Port: ${PORT}`));
})
    .catch((error) => console.log(`${error} did not connect`));
// bot();
