import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/me", authenticate, (req, res) => {
  res.json({
    message: "You are authenticated",
    user: req.user,
  });
});

export default router;