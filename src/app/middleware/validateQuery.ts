import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: any;
    }
  }
}

const validateQuery = (schema: ZodType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.validatedQuery = schema.parse(req.query) as any;
      next();
    } catch (error) {
      next(error);
    }
  };
};

export default validateQuery;
