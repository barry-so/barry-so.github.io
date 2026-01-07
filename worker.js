addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// Replace with your actual Google Apps Script ID
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwE15iZDguytNunpHCitywrwZs0vIsfMuDGtmFFX9fAv_bl_-Qh3tI2Qzq-6wcoxWjFBg/exec';

async function handleRequest(request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  // Handle OPTIONS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Lazy-load endpoint: ?imageUrl=...
  if (params.get("imageUrl")) {
    return fetchImageAsBase64(params.get("imageUrl"));
  }

  // Normal metadata fetch from GAS
  let fullUrl = GAS_URL;
  if (request.method === 'GET') {
    fullUrl += '?' + params.toString();
  }

  const fetchOptions = {
    method: request.method,
    headers: request.headers,
    body: request.method === 'POST' ? await request.text() : undefined,
    redirect: 'follow'
  };

  const response = await fetch(fullUrl, fetchOptions);
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');

  return newResponse;
}

// Fetch a single image URL and return Base64
async function fetchImageAsBase64(imageUrl) {
  try {
    // Validate URL parameter
    if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim() === '') {
      return new Response(JSON.stringify({ error: 'Invalid image URL provided' }), {
        status: 400, // Bad Request - missing or invalid parameter
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(imageUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return new Response(JSON.stringify({ error: 'URL must use HTTP or HTTPS protocol' }), {
          status: 400, // Bad Request - invalid protocol
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        });
      }
    } catch (urlError) {
      return new Response(JSON.stringify({ error: `Invalid URL format: ${urlError.message}` }), {
        status: 400, // Bad Request - malformed URL
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    // Fetch the image
    const resp = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Cloudflare-Worker)',
      },
      redirect: 'follow'
    });

    // Handle fetch failures with appropriate status codes
    if (!resp.ok) {
      const statusCode = resp.status === 404 ? 404 : // Not Found
                        resp.status === 403 ? 403 : // Forbidden
                        resp.status === 401 ? 401 : // Unauthorized
                        resp.status >= 500 ? 502 : // Bad Gateway (upstream server error)
                        400; // Bad Request (other 4xx errors)
      
      return new Response(JSON.stringify({ 
        error: `Failed to fetch image: ${resp.status} ${resp.statusText}` 
      }), {
        status: statusCode,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    // Get the content type from response, default to jpeg if not available
    const contentType = resp.headers.get('Content-Type') || 'image/jpeg';
    
    // Validate it's an image
    if (!contentType.startsWith('image/')) {
      return new Response(JSON.stringify({ 
        error: `URL does not point to an image. Content-Type: ${contentType}` 
      }), {
        status: 415, // Unsupported Media Type - correct status for non-image content
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    // Convert to base64
    const arrayBuffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    const base64 = `data:${contentType};base64,${btoa(binary)}`;

    return new Response(JSON.stringify({ base64 }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  } catch (e) {
    // Determine appropriate status code based on error type
    let statusCode = 500; // Internal Server Error - default for unexpected errors
    let errorMessage = e.message || 'Unknown error occurred';
    
    // Network errors (DNS, connection refused, timeout, etc.)
    if (e.name === 'TypeError' && e.message.includes('fetch')) {
      statusCode = 502; // Bad Gateway - network/connection issue
      errorMessage = 'Network error: Unable to reach image server';
    }
    // Timeout errors
    else if (e.name === 'AbortError' || e.message.includes('timeout')) {
      statusCode = 504; // Gateway Timeout
      errorMessage = 'Request timeout: Image server did not respond in time';
    }
    
    return new Response(JSON.stringify({ 
      error: `Failed to fetch image: ${errorMessage}` 
    }), {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
}

