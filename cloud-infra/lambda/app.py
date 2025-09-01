import os
import json
import time
import boto3
import base64

firehose_client = boto3.client("firehose")
STREAM = os.environ["FIREHOSE_NAME"]

def _ndjson(obj):
    return (json.dumps(obj, separators=(",", ":")) + "\n").encode()

def handler(event, context):
    try:
        body = event.get("body")
        if event.get("isBase64Encoded"):
            body = base64.b64decode(body or b"").decode("utf-8")
        data = json.loads(body or "{}")
    except Exception:
        data = {}

    rec = {
        "type": str(data.get("type", "unknown"))[:64],
        "ts": int(data.get("ts") or 0) or int(time.time() * 1000),
        "href": data.get("href"),
        "props": data
    }

    firehose_client.put_record(DeliveryStreamName=STREAM, Record={"Data": _ndjson(rec)})

    return {
        "statusCode": 204,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "content-type, x-api-key",
            "Access-Control-Allow-Methods": "POST,OPTIONS"
        },
        "body": ""
    }
