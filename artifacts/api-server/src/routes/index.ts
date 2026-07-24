import { Router, type IRouter } from "express";
import healthRouter from "./health";
import embeddingRouter from "./embedding";
import aramaRouter from "./arama";
import ragRouter from "./rag";

const router: IRouter = Router();

router.use(healthRouter);
router.use(embeddingRouter);
router.use(aramaRouter);
router.use(ragRouter);

export default router;
