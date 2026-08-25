import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ragRouter from "./rag";
import hafizaRouter from "./hafiza";
import adminRouter from "./admin";
import voiceRouter from "./voice";
import accountRouter from "./account";
import { jwtDogrula } from "../middleware/auth";
import { ipRateLimit, kullaniciRateLimit } from "../middleware/rate-limit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ipRateLimit);
router.use(jwtDogrula);
router.use(kullaniciRateLimit);
router.use(accountRouter);
router.use(adminRouter);
router.use(voiceRouter);
router.use(ragRouter);
router.use(hafizaRouter);

export default router;
