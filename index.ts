import dotenv from "dotenv";
import mongoose from "mongoose";
import configsRoutes from "./routes/configs"
import symbolRoutes from "./routes/symbols"
import loginRouter from "./routes/login";
import express, { Express } from "express";
import cors from "cors";
import bot from "./bot";

dotenv.config();
const app: Express = express();

app.use(express.json());
app.use(cors());


/* ROUTES */
app.use("/symbols", symbolRoutes);
app.use("/configs", configsRoutes);
app.use('/login', loginRouter);

/* MONGOOSE SETUP */
const PORT = process.env.PORT || 8000;
mongoose
  .connect(process.env.MONGO_URL || "")
  .then(() => {
    app.listen(PORT, () => console.log(`Server Port: ${PORT}`));
  })
  .catch((error) => console.log(`${error} did not connect`));

bot();
