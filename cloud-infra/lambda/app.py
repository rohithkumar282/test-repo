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
        print(event)
        body = event["body"]
        if isinstance(body, str):
            data = json.loads(body)
        else:
            data = body 

        rec = {
            "device_id": data["device_id"],
            "ts": int(data["ts"] or 0) or int(time.time() * 1000),
            "temp_c": data["temp_c"],
            "humidity": data["humidity"],
        }
        print('data for firehose', rec)
        firehose_client.put_record(DeliveryStreamName=STREAM,Record={"Data": _ndjson(rec)})
        print('success firehose')

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps(rec),
        }

    except Exception as e:
        print(e)
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(e)}),
        }
