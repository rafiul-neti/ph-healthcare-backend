import multer from "multer";

// set up multer for handling file upload
const storage = multer.memoryStorage();
export const upload = multer({ storage });
