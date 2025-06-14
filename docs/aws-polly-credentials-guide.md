# AWS Credentials Guide for Amazon Polly

This guide walks you through obtaining AWS credentials specifically for using Amazon Polly Text-to-Speech service.

## Table of Contents
1. [Creating an AWS Account](#1-creating-an-aws-account)
2. [Creating an IAM User with Polly Permissions](#2-creating-an-iam-user-with-polly-permissions)
3. [Generating Access Keys](#3-generating-access-keys)
4. [Configuring Your Application](#4-configuring-your-application)
5. [Security Best Practices](#5-security-best-practices)
6. [Polly-Specific IAM Policy Example](#6-polly-specific-iam-policy-example)

## 1. Creating an AWS Account

If you don't already have an AWS account:

1. **Navigate to AWS Sign-up Page**
   - Go to [https://aws.amazon.com/](https://aws.amazon.com/)
   - Click "Create an AWS Account"

2. **Provide Account Information**
   - Enter your email address and choose a password
   - Select "Personal" or "Professional" account type
   - Fill in your contact information

3. **Add Payment Method**
   - Enter a valid credit/debit card
   - Note: AWS offers a free tier, but requires payment information for verification

4. **Verify Your Identity**
   - Choose verification by SMS or voice call
   - Enter the verification code

5. **Select Support Plan**
   - Choose "Basic Support - Free" for getting started

## 2. Creating an IAM User with Polly Permissions

Never use your root account credentials for applications. Instead, create an IAM user:

1. **Access IAM Console**
   - Sign in to the [AWS Management Console](https://console.aws.amazon.com/)
   - Search for "IAM" in the services search bar
   - Click on "IAM" to open the Identity and Access Management console

2. **Create a New User**
   - In the left sidebar, click "Users"
   - Click the "Create user" button
   - Enter a username (e.g., `polly-user` or `anki-polly-user`)
   - Click "Next"

3. **Set Permissions**
   - Select "Attach policies directly"
   - Search for "Polly" in the policy search box
   - Check the box next to `AmazonPollyReadOnlyAccess` (for basic usage)
   - Alternatively, for more restricted access, click "Create policy" (see section 6 for custom policy)
   - Click "Next"

4. **Review and Create**
   - Review the user details
   - Click "Create user"

## 3. Generating Access Keys

1. **Access User Security Credentials**
   - From the IAM Users list, click on your newly created user
   - Click on the "Security credentials" tab

2. **Create Access Key**
   - Scroll down to "Access keys" section
   - Click "Create access key"

3. **Select Use Case**
   - Choose "Application running outside AWS"
   - Check the confirmation box
   - Click "Next"

4. **Set Description Tag (Optional)**
   - Add a description like "Anki vocabulary app" to help identify the key's purpose
   - Click "Create access key"

5. **Save Your Credentials**
   - **IMPORTANT**: This is your only chance to view the secret access key
   - Click "Download .csv file" to save your credentials
   - Or copy both:
     - Access key ID (looks like: `AKIAIOSFODNN7EXAMPLE`)
     - Secret access key (looks like: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`)

## 4. Configuring Your Application

### Option A: Environment Variables (Recommended)

Add to your `.env` file:
```bash
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1  # or your preferred region
```

### Option B: AWS Credentials File

Create or edit `~/.aws/credentials`:
```ini
[default]
aws_access_key_id = your_access_key_id_here
aws_secret_access_key = your_secret_access_key_here
```

Create or edit `~/.aws/config`:
```ini
[default]
region = us-east-1
```

## 5. Security Best Practices

### Essential Security Measures

1. **Never Commit Credentials**
   - Add `.env` to your `.gitignore` file
   - Never hardcode credentials in your source code
   - Use environment variables or AWS credentials file

2. **Use Least Privilege Principle**
   - Only grant the minimum permissions needed
   - For Polly, typically only `polly:SynthesizeSpeech` is required

3. **Rotate Access Keys Regularly**
   - Set a reminder to rotate keys every 90 days
   - Delete old keys after creating new ones

4. **Monitor Key Usage**
   - Enable CloudTrail to log API calls
   - Set up billing alerts to detect unusual activity

5. **Use MFA for AWS Console**
   - Enable Multi-Factor Authentication for your AWS root account
   - Also enable MFA for IAM users with console access

### Additional Recommendations

- **Use AWS IAM Roles** when running on EC2 or Lambda
- **Implement IP Whitelisting** if accessing from fixed locations
- **Enable AWS Config** to track configuration changes
- **Use AWS Secrets Manager** for production applications

## 6. Polly-Specific IAM Policy Example

### Minimal Polly Access Policy

This policy grants only the essential permission to synthesize speech:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "polly:SynthesizeSpeech"
            ],
            "Resource": "*"
        }
    ]
}
```

### Extended Polly Access Policy

This policy includes additional useful permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "polly:SynthesizeSpeech",
                "polly:DescribeVoices",
                "polly:ListLexicons",
                "polly:GetLexicon"
            ],
            "Resource": "*"
        }
    ]
}
```

### Creating a Custom Policy

1. In IAM Console, click "Policies" in the left sidebar
2. Click "Create policy"
3. Click "JSON" tab
4. Paste one of the policies above
5. Click "Next"
6. Name your policy (e.g., `PollyMinimalAccess`)
7. Click "Create policy"
8. Attach this policy to your IAM user instead of the AWS managed policy

## Troubleshooting Common Issues

### "Invalid credentials" Error
- Verify access key ID and secret key are correct
- Ensure no extra spaces when copying credentials
- Check if keys are active in IAM console

### "Access Denied" Error
- Verify the IAM user has necessary Polly permissions
- Check if you're using the correct AWS region
- Ensure the policy is attached to the user

### "Service Not Available in Region" Error
- Amazon Polly is not available in all regions
- Use a supported region like `us-east-1`, `eu-west-1`, or `ap-southeast-1`
- See [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/)

## Cost Considerations

Amazon Polly Pricing (as of 2024):
- **Free Tier**: 5 million characters per month for 12 months
- **Standard voices**: $4.00 per 1 million characters
- **Neural voices**: $16.00 per 1 million characters

For typical Anki vocabulary usage, the free tier should be more than sufficient.

## Next Steps

1. Test your credentials with a simple Polly API call
2. Implement error handling for API failures
3. Consider caching synthesized audio to reduce API calls
4. Set up AWS billing alerts to monitor usage

## Additional Resources

- [Amazon Polly Documentation](https://docs.aws.amazon.com/polly/)
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS Security Best Practices](https://aws.amazon.com/architecture/security-identity-compliance/)
- [Boto3 Polly Documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/polly.html)