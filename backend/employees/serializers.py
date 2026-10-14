
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from accounts.models import UserProfile
from .models import Employee

User = get_user_model()


class EmployeeSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True)
    password = serializers.CharField(
        write_only=True,
        required=True,
        min_length=12,
    )
# These fields are used when creating the account.
# They are write-only because they belong to Django's User model,
# not directly to the Employee model.
    email = serializers.EmailField(write_only=True)

    first_name = serializers.CharField(
    max_length=150,
    write_only=True,
)

    last_name = serializers.CharField(
    max_length=150,
    required=False,
    allow_blank=True,
    write_only=True,
)

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_code",
            "username",
            "password",
            "email",
            "first_name",
            "last_name",
            "department",
            "designation",
            "joining_date",
            "salary",
            "phone",
            "address",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_employee_code(self, value):
        value = value.strip()

        queryset = Employee.objects.filter(employee_code=value)
        if self.instance:#self.instance means serializer-kku already existing employee object provide pannirukkaangala-nu check pannum.
            queryset = queryset.exclude(pk=self.instance.pk) #Current employee-ai duplicate check-la irundhu remove pannum.

        if queryset.exists():
            raise serializers.ValidationError(
                "This employee code already exists."
            )

        return value

    def validate_salary(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Salary cannot be negative."
            )
        return value

    def validate(self, attrs):
        # Employee login credentials are needed only at creation.
        if self.instance:
            attrs.pop("username", None)#he validated input fields.
            attrs.pop("password", None)
            attrs.pop("email", None)
            attrs.pop("first_name", None)
            attrs.pop("last_name", None)#attrs.pop() use panradhu, "Employee update pannumbodhu login details-ai touch panna vendam; employee details mattum update pannunga" nu enforce pannradhukku.
        else:
            if User.objects.filter(
                username=attrs["username"]
            ).exists():
                raise serializers.ValidationError({
                    "username": "This username already exists."
                })

            if User.objects.filter(
                email__iexact=attrs["email"]
            ).exists():
                raise serializers.ValidationError({
                    "email": "This email is already registered."
                })

        return attrs

    @transaction.atomic #Create process-la multiple database operations irundha, ellam successful-ah nadandha commit aagum. Edhavadhu error vandhu transaction rollback aana, andha transaction-kulla nadandha database changes undo aagum.
    def create(self, validated_data):
        username = validated_data.pop("username")
        password = validated_data.pop("password")
        email = validated_data.pop("email")
        first_name = validated_data.pop("first_name")
        last_name = validated_data.pop("last_name", "")

        # Django hashes the password before saving it.
        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
            first_name=first_name,
            last_name=last_name,
        )

        # Create the HRMS role for the new login account.
        UserProfile.objects.create(
            user=user,
            role=UserProfile.Role.EMPLOYEE,
        )

        return Employee.objects.create(
            user=user,
            **validated_data,#reamaing all data
        )

    @transaction.atomic
    def update(self, instance, validated_data):
        # Update the existing employee's profile.
        for field, value in validated_data.items():
            if field in {
                "employee_code",
                "department",
                "designation",
                "joining_date",
                "salary",
                "phone",
                "address",
                "is_active",
            }:
                setattr(instance, field, value)

        instance.save()
        return instance

    def to_representation(self, instance):#employee details-ai API response-la eppadi return pannanum-nu decide pannum.
        # Return safe user information, never the password.
        data = super().to_representation(instance)
        data["username"] = instance.user.username
        data["email"] = instance.user.email
        data["first_name"] = instance.user.first_name
        data["last_name"] = instance.user.last_name
        return data
