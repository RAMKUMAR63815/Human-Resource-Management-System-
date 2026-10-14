
from rest_framework.routers import DefaultRouter #"DefaultRouter automatically generates URL patterns for the CRUD operations defined in EmployeeViewSet

from .views import EmployeeViewSet 

router = DefaultRouter() 
router.register("", EmployeeViewSet, basename="employee")

urlpatterns = router.urls
