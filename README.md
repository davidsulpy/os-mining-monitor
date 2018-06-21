# Mining Rig Monitor

For more information, see [this post on bitform.at](https://bitform.at/post/180621/)

### To Deploy

```
$ aws cloudformation package --template-file sam.yaml --s3-bucket <some_writeable_bucket> --output-template-file sam-output.yaml
$ aws cloudformation deploy --template-file sam-output.yaml --stack-name mining-monitor
```