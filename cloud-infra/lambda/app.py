import os
import json
import time
import boto3
import base64

firehose_client = boto3.client("firehose")
STREAM = os.environ["FIREHOSE_NAME"]
CORS_HEADERS = {
    "Access-Control-Allow-Origin": os.environ.get("WEBSITE_ORIGIN", "*"),
    "Access-Control-Allow-Headers": "content-type, x-api-key",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

def _ndjson(obj):
    return (json.dumps(obj, separators=(",", ":")) + "\n").encode()

def handler(event, context):
    try:
        if event.get("httpMethod") == "OPTIONS":
            return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}
        body = event.get("body")
        if event.get("isBase64Encoded"):
            body = base64.b64decode(body or b"").decode("utf-8")
        data = json.loads(body or "{}")

        rec = {
            "type": str(data.get("type", "unknown"))[:64],
            "ts": int(data.get("ts") or 0) or int(time.time() * 1000),
            "href": data.get("href"),
            "props": data,
        }

        firehose_client.put_record(DeliveryStreamName=STREAM, Record={"Data": _ndjson(rec)})
        return {"statusCode": 204, "headers": CORS_HEADERS, "body": ""}

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(e)}),
        }