class OmIntegrationError(Exception):
    pass


class OmConfigurationError(OmIntegrationError):
    pass


class OmRealCallsDisabledError(OmIntegrationError):
    pass


class OmApiError(OmIntegrationError):
    """Échec HTTP ou réseau lors d'un appel à l'API Orange Money.

    Conserve le statut HTTP et le corps de la réponse pour le diagnostic.
    """

    def __init__(self, message, *, status_code=None, response_body=None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body
