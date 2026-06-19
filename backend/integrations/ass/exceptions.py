class AssIntegrationError(Exception):
    pass


class AssConfigurationError(AssIntegrationError):
    pass


class AssRealCallsDisabledError(AssIntegrationError):
    pass


class AssApiError(AssIntegrationError):
    """Echec HTTP ou reseau lors d'un appel a l'API ASS.

    Conserve le statut HTTP et le corps de la reponse ASS (codes 4006/4007/4010,
    messages...) pour le diagnostic et les rapports d'anomalie exiges par les CGU.
    """

    def __init__(self, message, *, status_code=None, response_body=None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body
