class AssIntegrationError(Exception):
    pass


class AssConfigurationError(AssIntegrationError):
    pass


class AssRealCallsDisabledError(AssIntegrationError):
    pass
