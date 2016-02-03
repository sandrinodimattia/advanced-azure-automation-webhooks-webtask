# Creating advanced webhooks for Azure Automation using a Webtask

Azure Automation already supports webhooks but these are currently scoped to a single runbook. This webtask shows how you can have secret settings (encrypted), internal settings (which the caller of the webhook cannot change) and also public settings. These public settings allow you to:

 - Specify values (eg: the name of the runbook) in the querystring
 - Specify values in the POST body
 
## Prerequisites

You will need an Automation Account in which you have a Runbook. For example:

```
workflow Sample-Runbook
{
   param ([Parameter(Mandatory=$false)][object]$context)
    # Context which was sent to the runbook.
	if ($context) {
		$body = ConvertTo-Json -InputObject $context 
		Write-Output "You sent: ${body}"
	} else {
		Write-Output "You did not send anything."
	}
	
    # Get the credential.
	$credentialName = 'DefaultAzureCredential'
    $credential = Get-AutomationPSCredential -Name $credentialName
    if(!$credential) {
        Throw "Could not find an Automation Credential Asset named '${credentialName}'. Make sure you have created one in this Automation Account."
    }

    # Connect to your Azure Account
    $account = Add-AzureAccount -Credential $credential
    if(!$account) {
        Throw "Could not authenticate to Azure using the credential asset '${credential}'. Make sure the user name and password are correct."
    }

	# Return Subscription
    $subscription = Get-AzureSubscription -Default
	$subscriptionBody = ConvertTo-Json -InputObject $subscription
    Write-Output "Your default Azure subscription is: ${subscriptionBody}"
}
```

The `$context` parameter here is important, as the Webtask will send everything over in the `context` parameter (JSON object).

## Deployment

Download `task.js` from this repository and change it to match your needs:

 - `internalSettings`: This should reflect your environment (Resource Group name, ...)
 - `parameters`: This is the final payload which is sent to the Runbook. You can add any values you want here. Everything from the querystring is added by default.

Once your task is ready you can go ahead and deploy it:

```
npm i -g wt-cli
wt init
wt create task.js \
    --name some-random-name-that-is-hard-to-guess \
    --secret AD_TENANT_ID="YOUR_TENANT_ID" \
    --secret AD_CLIENT_ID="YOUR_CLIENT_ID" \
    --secret AD_SERVICE_PRINCIPAL_PASSWORD="SP_PASSWORD" \
    --secret AZURE_SUBSCRIPTION_ID="YOUR_SUBSCRIPTION_ID"
```

> Note: [This blog post](http://fabriccontroller.net/using-adal-and-the-azure-resource-manager-rest-api-from-within-a-webtask/) explains how you can create a Service Principal and access these values.

## Usage

Once the Webtask has been deployed, you can call it using curl/Postman/...:

```
curl https://webtask.it.auth0.com/api/run/YOUR_CONTAINER/some-random-name-that-is-hard-to-guess?RUNBOOK_NAME=Sample-Runbook\&a=b\&c=d\&foo=bar
```

At the same time, you can use `wt logs` to see the Webtask running in real time:

```
wt logs

[11:14:31.083Z]  INFO wt: new webtask request 1454498070824.448762
[11:14:31.611Z]  INFO wt: Authenticating...
[11:14:31.834Z]  INFO wt: Sending request to: /providers/Microsoft.Automation/automationAccounts/MY-ACCOUNT/jobs/8544e911-9215-486d-891f-36ef5c0be9bb?api-version=2015-01-01-preview
[11:14:33.909Z]  INFO wt:
    Success: {
      "id": "/subscriptions/MY-SUBSCRIPTION/resourceGroups/lab/providers/Microsoft.Automation/automationAccounts/MY-ACCOUNT/jobs/8544e911-9215-486d-891f-36ef5c0be9bb",
      "properties": {
        "jobId": "8544e911-9215-486d-891f-36ef5c0be9bb",
        "runbook": {
          "name": "Sample-Runbook"
        },
        "provisioningState": "Processing",
        "creationTime": "2016-02-03T11:14:34.077+00:00",
        "endTime": null,
        "exception": null,
        "lastModifiedTime": "2016-02-03T11:14:34.077+00:00",
        "lastStatusModifiedTime": "2016-02-03T11:14:34.077+00:00",
        "startedBy": "",
        "startTime": null,
        "status": "New",
        "statusDetails": "None",
        "parameters": {
          "MicrosoftApplicationManagementStartedBy": "\"A Webtask\"",
          "context": "{\"a\":\"b\",\"c\":\"d\",\"foo\":\"bar\",\"someInternalValue\":1,\"someSecretValue\":\"1235894899393\"}"
        },
        "runOn": null
      }
    }
```

As you can see we are sending both internal value, secrets and the contents of the querystring over to the Runbook.
