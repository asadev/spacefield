import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
const s3 = new S3Client({
  region: "auto",
  endpoint: "https://your-r2-account-id.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "3bf7834a75167d63eec88ccc1d35a4b7",
    secretAccessKey: "a18689a7685736596059b9fb69be5de00d8df545b2256a5aa4ae8d081cb501b5",
  },
});
const Bucket = "spacefield-files";
try {
  await s3.send(new HeadBucketCommand({ Bucket }));
  console.log("bucket exists");
} catch {
  await s3.send(new CreateBucketCommand({ Bucket }));
  console.log("bucket created");
}
