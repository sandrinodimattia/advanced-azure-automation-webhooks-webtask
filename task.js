"use latest";

const _ = require('lodash');
const adal = require('adal-node');
const request = require('request');
const uuid = require('node-uuid');

// Get a token for the Resource Manager API.
const authenticate = (tenantId, clientId, servicePrincipalPassword, cb) => {
  console.log('Authenticating...');
  
  const context = new adal.AuthenticationContext(`https://login.windows.net/${tenantId}`);
  context.acquireTokenWithClientCredentials(`https://management.azure.com/`, clientId, servicePrincipalPassword, (err, res) => {
    if (err) {
      return cb(err);
    }

    return cb(null, res.accessToken);
  });
}

// Micro client to send requests to Resource Manager.
const sendRequest = (accessToken, subscriptionId, resourceGroup, path, req, cb) => {
  console.log(`Sending request to: ${path}`);
  
  const options = {
    url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}${path}`,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    json: req
  };

  request.put(options, (err, res, body) => {
    if (err) {
      return cb(err);
    }

    if (res.statusCode !== 201) {
      return cb({
        status: res.statusCode,
        error: body
      });
    }
    
    return cb(null, body);
  });
}

// Validate required settings.
const validateSettings = (settings, cb) => {
  let required_settings = [
      'AD_CLIENT_ID', 
      'AD_SERVICE_PRINCIPAL_PASSWORD', 
      'AD_TENANT_ID',
      'AZURE_SUBSCRIPTION_ID',
      'RUNBOOK_NAME'
  ];
  
  let missing_settings = required_settings.filter((setting) => !settings[setting]);
  if (missing_settings.length) {
    cb({ message: 'Missing settings: ' + missing_settings.join(', ') });
    return false;
  }  
  
  return true;
}

// The actual webtask.
module.exports = (ctx, done) => {
  if (!validateSettings(ctx.data, done)) {
    return;
  }
  
  const internalSettings = {
    resourceGroup: "lab",
    automationAccount: "automation-lab"
  };

  authenticate(ctx.data.AD_TENANT_ID, ctx.data.AD_CLIENT_ID, ctx.data.AD_SERVICE_PRINCIPAL_PASSWORD, (err, accessToken) => {
    if (err) {
      return done({
        message: 'Error authenticating.',
        err: err
      });
    }
    
    const jobId = uuid.v4();
    const parameters = _.extend({ }, ctx.query, { 
        someInternalValue: 1,
        someSecretValue: ctx.data.AD_CLIENT_ID
    });
    
    const req = {
      properties: {
        runbook: {
           name: ctx.query.RUNBOOK_NAME
        },
        parameters: {
           context: JSON.stringify(parameters),
           MicrosoftApplicationManagementStartedBy: "\"A Webtask\""
        }
      },
      tags: {}
    };
    
    const path = `/providers/Microsoft.Automation/automationAccounts/${internalSettings.automationAccount}/jobs/${jobId}?api-version=2015-01-01-preview`
    sendRequest(accessToken, ctx.data.AZURE_SUBSCRIPTION_ID, internalSettings.resourceGroup, path, req, (err, body) => {
      if (err) {
        console.log('Error starting Runbook:', err.message || JSON.stringify(err, null, 2));
        return done({ err: err });
      }

      console.log(`Success: ${JSON.stringify(body, null, 2)}`)
      return done(null, body);
    });
  });
};