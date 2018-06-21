# Mining Rig Monitor

Send data from a mining farm and ethereum network to Initial State to turn into a beautiful, interactive operations dashboard.

For more information, see [this post on bitform.at](https://bitform.at/post/180621/)

### To Deploy

```
$ aws cloudformation package --template-file sam.yaml --s3-bucket <some_writeable_bucket> --output-template-file sam-output.yaml
$ aws cloudformation deploy --template-file sam-output.yaml --stack-name mining-monitor
```