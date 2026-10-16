from rest_framework import serializers

from .models import Holiday, OptionalHolidaySelection


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = [
            "id",
            "name",
            "date",
            "holiday_type",
            "region",
            "description",
            "is_active",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        holiday_type = attrs.get(
            "holiday_type",
            getattr(self.instance, "holiday_type", Holiday.HolidayType.COMPANY),
        )
        region = attrs.get(
            "region",
            getattr(self.instance, "region", ""),
        )

        if holiday_type == Holiday.HolidayType.REGIONAL and not region.strip():
            raise serializers.ValidationError({
                "region": "Region is required for regional holidays."
            })

        if holiday_type != Holiday.HolidayType.REGIONAL:
            attrs["region"] = ""

        return attrs


class OptionalHolidaySelectionSerializer(serializers.ModelSerializer):
    holiday_name = serializers.CharField(
        source="holiday.name",
        read_only=True,
    )
    holiday_date = serializers.DateField(
        source="holiday.date",
        read_only=True,
    )

    class Meta:
        model = OptionalHolidaySelection
        fields = [
            "id",
            "holiday",
            "holiday_name",
            "holiday_date",
            "selected_at",
        ]
        read_only_fields = [
            "id",
            "holiday_name",
            "holiday_date",
            "selected_at",
        ]
