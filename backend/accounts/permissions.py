from rest_framework.permissions import BasePermission


class IsAdminGeneral(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin_general)


class IsAdminGeneralOrGroupAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_admin_general or request.user.is_admin_group)
        )


def can_access_organization(user, organization_id):
    if user.is_admin_general:
        return True
    return bool(user.organization_id and user.organization_id == organization_id)


def can_manage_user(actor, target_user):
    if not actor.is_authenticated:
        return False
    return actor.can_manage_user(target_user)


def can_manage_commission(actor, target_user):
    if not actor.is_authenticated:
        return False
    return actor.can_manage_commission(target_user)
