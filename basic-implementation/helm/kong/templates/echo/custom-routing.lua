local BasePlugin = require "kong.plugins.base_plugin"
local ngx = ngx

local CustomRoutingHandler = BasePlugin:extend()

CustomRoutingHandler.PRIORITY = 900
CustomRoutingHandler.VERSION = "1.0.0"

function CustomRoutingHandler:new()
    CustomRoutingHandler.super.new(self, "custom-routing")
end

function CustomRoutingHandler:access(conf)
    CustomRoutingHandler.super.access(self)

    -- Get the "X-Route-To" header
    local target_service = ngx.req.get_headers()["X-Route-To"]

    -- Default upstream
    local upstream = conf.default_upstream or "default.local"

    if target_service == "service1" then
        upstream = "service1.local"
    elseif target_service == "service2" then
        upstream = "service2.local"
    end

    -- Log the decision
    ngx.log(ngx.NOTICE, "[CustomRouting] Routing to: " .. upstream)

    -- Rewrite the upstream
    ngx.var.upstream_host = upstream
end

return CustomRoutingHandler
