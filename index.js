const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const mammoth = require("mammoth");
const XLSX = require("xlsx");

// Tesseract Imports
const util = require("util");
// const pdfPoppler = require("pdf-poppler");
const { fromPath } = require('pdf2pic');
const { createWorker } = require("tesseract.js");

const app = express();
app.use(cors());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

// Multer is for Storage
const upload = multer({ storage: storage });

// Tesseract logic
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = path.join(__dirname, req.file.path);
    const fileType = req.file.mimetype;
    let finalText = "";

    if (fileType === "application/pdf") {
      const worker = await createWorker();
      const imageDir = path.join(__dirname, "generatedimages");
      fs.mkdirSync(imageDir, { recursive: true });
      const opts = {
        density: 100,
        saveFilename: path.basename(filePath, path.extname(filePath)),
        savePath: imageDir,
        format: "png",
        width: 600,
        height: 600,
      };
      const storeAsImage = fromPath(filePath, opts);

      const images = await storeAsImage.bulk(-1, { responseType: "base64" });

      for (const [index, image] of images.entries()) {
        const imagePath = path.join(imageDir, `${opts.saveFilename}_${index}.png`);
        fs.writeFileSync(imagePath, image.base64, 'base64');
        const {
          data: { text },
        } = await worker.recognize(imagePath);
        finalText += text + "\n";
        fs.unlinkSync(imagePath); // Delete the image after OCR
      }

      await worker.terminate();
    }
    // Rest of your code...
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send(
        "An error occurred while extracting text from the file or saving the extracted text to a file."
      );
    return;
  }
});

app.get("/download", function (req, res) {
  const file = `${__dirname}/uploads/${req.query.filename}`;
  res.download(file); // Set disposition and send it.
});

app.get("/search", async (req, res) => {
  const keyword = req.query.keyword.toLowerCase(); // Convert keyword to lowercase
  const directoryPath = path.join(__dirname, "uploads");
  let filesContainingKeyword = [];

  try {
    const files = await fs.promises.readdir(directoryPath);

    for (let file of files) {
      if (file.endsWith(".txt")) {
        let filePath = path.join(directoryPath, file);
        let data = await fs.promises.readFile(filePath, "utf8");
        let lowerCaseData = data.toLowerCase();
        if (lowerCaseData.includes(keyword)) {
          // Convert data to lowercase
          let index = lowerCaseData.indexOf(keyword);
          let preview = data.substring(index, index + 100) + "..."; // Get a substring of 100 characters around the keyword
          let pdfFile = file.replace(".txt", "");
          filesContainingKeyword.push({ filename: pdfFile, preview: preview });
          console.log(`Found keyword in ${filePath}`);
        } else {
          console.log(`Keyword not found in ${filePath}`);
        }
      }
    }

    res.send(filesContainingKeyword);
  } catch (err) {
    console.error("Unable to scan directory: " + err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/", (req, res) => {
  res.send("Node API For Local Indexing.");
});

app.listen(8080, () => console.log("Server started on port 8080"));
