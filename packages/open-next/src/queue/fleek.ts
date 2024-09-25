import { Queue } from "./types";

// Expected environment variables
const { FLEEK_FUNCTION_URL, REVALIDATION_QUEUE_URL } = process.env;

const queue: Queue = {
  send: async ({ MessageBody, MessageDeduplicationId, MessageGroupId }) => {
    try {
      const result = await fetch(FLEEK_FUNCTION_URL ?? "", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-amz-json-1.0",
          "X-Amz-Target": "AmazonSQS.SendMessage",
        },
        body: JSON.stringify({
          QueueUrl: REVALIDATION_QUEUE_URL,
          MessageBody: JSON.stringify(MessageBody),
          MessageDeduplicationId,
          MessageGroupId,
        }),
      });

      if (result.status !== 200) {
        throw new Error(`Failed to send message: ${result.status}`);
      }
    } catch (e) {
      console.error(e);
    }
  },
  name: "fleek",
};

export default queue;
