# Mining Rig Monitor

Send data from a mining farm and ethereum network to Initial State to turn into a beautiful, interactive operations dashboard.

For more information, see [this post on bitform.at](https://bitform.at/post/180621/)

### To Deploy

```
$ aws cloudformation package --template-file sam.yaml --s3-bucket <some_writeable_bucket> --output-template-file sam-output.yaml
$ aws cloudformation deploy --template-file sam-output.yaml --stack-name mining-monitor --capabilities CAPABILITY_IAM
```

### Things to note

This is not necessarily production-ready nodejs, though you can freely run it to monitor your farm. Deploying this template it will consume the following AWS services that may incur costs:
- Lambda
- S3
- DynamoDB
- SNS

Additionally, you'll need a valid Initial State AccessKey in order to use this project correctly. Get one from your account on https://app.initialstate.com