import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mainRouter from "./routers/main";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors({ origin: "*" }));
app.use("/main", mainRouter);

app.get("/", (req, res) => res.json({ msg: `Yes I'm Alive!` }));

app.listen(port, () => console.log(`Swiftube server is listening on ${port}`));
