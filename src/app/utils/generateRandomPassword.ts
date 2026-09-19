import crypto from "node:crypto";
import { AppError } from "./AppError";

const generateRandomPassword = (length: number = 10) => {
  if (length < 8) {
    throw new AppError(400, "Length must be at least 8.");
  }

  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = lower.toUpperCase();
  const digits = "0123456789";
  const specials = "!@#$%^&*()_+=-<>?";

  const all = lower + upper + digits + specials;

  const pick = (chars: string) => chars[crypto.randomInt(chars.length)];

  const chars = [pick(lower), pick(upper), pick(digits), pick(specials)];

  for (let i = chars.length; i < length; i++) {
    chars.push(pick(all));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);

    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("")
};

export default generateRandomPassword;
