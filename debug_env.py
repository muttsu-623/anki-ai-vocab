#!/usr/bin/env python3
"""Debug script to check environment variables"""

import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

print("Checking environment variables:")
print(f"OPENAI_API_KEY: {'Set' if os.getenv('OPENAI_API_KEY') else 'Not set'}")
print(f"AWS_ACCESS_KEY_ID: {'Set' if os.getenv('AWS_ACCESS_KEY_ID') else 'Not set'}")
print(f"AWS_SECRET_ACCESS_KEY: {'Set' if os.getenv('AWS_SECRET_ACCESS_KEY') else 'Not set'}")
print(f"AWS_DEFAULT_REGION: {os.getenv('AWS_DEFAULT_REGION', 'Not set')}")

# Show first few characters of keys if set (for debugging)
if os.getenv('AWS_ACCESS_KEY_ID'):
    print(f"AWS_ACCESS_KEY_ID starts with: {os.getenv('AWS_ACCESS_KEY_ID')[:4]}...")
if os.getenv('AWS_SECRET_ACCESS_KEY'):
    print(f"AWS_SECRET_ACCESS_KEY is {len(os.getenv('AWS_SECRET_ACCESS_KEY'))} characters long")