

local MyHeader = {}
local http = require "resty.http"
local cjson = require "cjson.safe"

MyHeader.PRIORITY = 1000
MyHeader.VERSION = "1.0.0"

function MyHeader:access(conf)
    local httpc = http.new()

    -- Retrieve the 'type' header from the incoming request
    local request_type = ngx.req.get_headers()["type"]
    local path = kong.request.get_path() -- e.g. /flask-api/io-intensive
    local query = kong.request.get_raw_query() -- e.g. size=1
    local modified_path = string.gsub(path, "^/flask%-api", "")
    
    kong.log("Request Type: ", request_type)

    -- Default to "simple_read" if the header is not provided
    if not request_type or request_type == "" then
        request_type = "simple_read"
    end

    -- Construct the URL with the extracted header value
    local url = "http://sharding-service.kong.svc.cluster.local:8080/select_shard?type=" .. ngx.escape_uri(request_type)

    local res, err = httpc:request_uri(url, {
        method = "GET",
        headers = {
            ["Content-Type"] = "application/json"
        }
    })

    if not res then
        kong.log.err("[myheader] Failed to call API: ", err)
        return kong.response.exit(500, { message = "Internal Server Error" })
    end

    kong.log.notice("[myheader] Response: ", res.body)

    -- Parse JSON safely
    local decoded_json, err = cjson.decode(res.body)

    if not decoded_json then
        kong.log.err("[myheader] Failed to decode JSON: ", err or "nil response body")
        return kong.response.exit(500, { message = "Invalid JSON response from sharding-service" })
    end

    -- Ensure `selected_shard` exists before using it
    local selected_shard = decoded_json.selected_shard
    if not selected_shard then
        kong.log.err("[myheader] 'selected_shard' key is missing in the JSON response")
        return kong.response.exit(500, { message = "Invalid response: missing 'selected_shard'" })
    end

    kong.log("[myheader] Selected Shard: ", selected_shard)

    -- Set upstream based on shard selection
    if selected_shard == "shard1" then
        kong.service.set_target("flask-app-service.shard1.svc.cluster.local", 5000)
        kong.service.request.set_path(modified_path)
        kong.service.request.set_raw_query(query)
    elseif selected_shard == "shard2" then
        kong.service.set_target("flask-app-service.shard2.svc.cluster.local", 5000)
        kong.service.request.set_path(modified_path)
        kong.service.request.set_raw_query(query)
    else
        kong.service.set_target("flask-app-service.shard1.svc.cluster.local", 5000)
        kong.service.request.set_path(modified_path)
        kong.service.request.set_raw_query(query)
        -- Default action if none of the conditions match
    end
    
end

function MyHeader:header_filter(conf)
    kong.log.notice("[myheader] Setting response header")
    kong.response.set_header("buddhima", conf.header_value)
end

return MyHeader


--[[ Uncomment for shard selection algo



local MyHeader = {}
local http = require "resty.http"
local cjson = require "cjson.safe"

MyHeader.PRIORITY = 1000
MyHeader.VERSION = "1.0.0"


function MyHeader:header_filter(conf)
    kong.log.notice("[myheader] Setting response header")
    kong.response.set_header("buddhima", conf.header_value)
end

return MyHeader

-- ]]
